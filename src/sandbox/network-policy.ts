import type { ScopePolicy } from '../domain/types.js';

export interface NetworkPolicyRule {
  action: 'allow' | 'deny';
  direction: 'ingress' | 'egress';
  protocol: 'tcp' | 'udp' | 'icmp' | 'all';
  destination?: string; // IP, CIDR, or hostname
  destinationPort?: number | string; // Port or range like '80-443'
  source?: string;
  sourcePort?: number | string;
  comment?: string;
}

export interface NetworkPolicy {
  defaultAction: 'allow' | 'deny';
  rules: NetworkPolicyRule[];
  dnsWhitelist: string[];
  allowLoopback: boolean;
  allowPrivateNetworks: boolean;
}

export interface NetworkPolicyBuilder {
  fromScopePolicy(scopePolicy: ScopePolicy): NetworkPolicy;
  toIptablesRules(policy: NetworkPolicy): string[];
  toDockerNetworkConfig(policy: NetworkPolicy): DockerNetworkConfig;
}

export interface DockerNetworkConfig {
  networkMode: 'none' | 'bridge' | string;
  dnsServers?: string[];
  extraHosts?: Record<string, string>;
  publishPorts?: Array<{ host: number; container: number; protocol?: 'tcp' | 'udp' }>;
}

export class DefaultNetworkPolicyBuilder implements NetworkPolicyBuilder {
  fromScopePolicy(scopePolicy: ScopePolicy): NetworkPolicy {
    const rules: NetworkPolicyRule[] = [];

    // Allow traffic to explicitly allowed assets
    for (const allowed of scopePolicy.allowedAssets) {
      if (this.isValidTarget(allowed)) {
        rules.push({
          action: 'allow',
          direction: 'egress',
          protocol: 'tcp',
          destination: this.extractHost(allowed),
          comment: `Allowed asset: ${allowed}`,
        });
      }
    }

    // Deny traffic to explicitly denied assets
    for (const denied of scopePolicy.deniedAssets) {
      if (this.isValidTarget(denied)) {
        rules.push({
          action: 'deny',
          direction: 'egress',
          protocol: 'all',
          destination: this.extractHost(denied),
          comment: `Denied asset: ${denied}`,
        });
      }
    }

    // Default deny-all policy for maximum security
    return {
      defaultAction: 'deny',
      rules,
      dnsWhitelist: this.extractDnsWhitelist(scopePolicy),
      allowLoopback: false,
      allowPrivateNetworks: false,
    };
  }

  toIptablesRules(policy: NetworkPolicy): string[] {
    const rules: string[] = [];

    // Flush existing rules (if we were to apply this in a container)
    rules.push('iptables -F');
    rules.push('iptables -X');

    // Default policies
    if (policy.defaultAction === 'deny') {
      rules.push('iptables -P INPUT DROP');
      rules.push('iptables -P FORWARD DROP');
      rules.push('iptables -P OUTPUT DROP');
    } else {
      rules.push('iptables -P INPUT ACCEPT');
      rules.push('iptables -P FORWARD ACCEPT');
      rules.push('iptables -P OUTPUT ACCEPT');
    }

    // Allow loopback
    if (policy.allowLoopback) {
      rules.push('iptables -A INPUT -i lo -j ACCEPT');
      rules.push('iptables -A OUTPUT -o lo -j ACCEPT');
    }

    // Allow established connections
    rules.push('iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT');
    rules.push('iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT');

    // DNS whitelist (allow DNS queries to specific servers)
    if (policy.dnsWhitelist.length > 0) {
      for (const dns of policy.dnsWhitelist) {
        rules.push(`iptables -A OUTPUT -p udp -d ${dns} --dport 53 -j ACCEPT`);
        rules.push(`iptables -A OUTPUT -p tcp -d ${dns} --dport 53 -j ACCEPT`);
      }
    }

    // Apply custom rules
    for (const rule of policy.rules) {
      const chain = rule.direction === 'ingress' ? 'INPUT' : 'OUTPUT';
      const action = rule.action === 'allow' ? 'ACCEPT' : 'DROP';
      let ruleStr = `iptables -A ${chain}`;

      if (rule.protocol !== 'all') {
        ruleStr += ` -p ${rule.protocol}`;
      }

      if (rule.destination) {
        ruleStr += ` -d ${rule.destination}`;
      }

      if (rule.destinationPort) {
        ruleStr += ` --dport ${rule.destinationPort}`;
      }

      if (rule.source) {
        ruleStr += ` -s ${rule.source}`;
      }

      if (rule.sourcePort) {
        ruleStr += ` --sport ${rule.sourcePort}`;
      }

      ruleStr += ` -j ${action}`;

      if (rule.comment) {
        ruleStr += ` -m comment --comment "${rule.comment}"`;
      }

      rules.push(ruleStr);
    }

    return rules;
  }

  toDockerNetworkConfig(policy: NetworkPolicy): DockerNetworkConfig {
    // For Docker, we use network isolation instead of iptables
    // The safest approach is to use --network=none and allow specific traffic via proxy
    const hasAllowedRules = policy.rules.some((rule) => rule.action === 'allow');

    if (!hasAllowedRules && policy.defaultAction === 'deny') {
      // Complete network isolation
      return {
        networkMode: 'none',
      };
    }

    // Use bridge mode with DNS restrictions
    return {
      networkMode: 'bridge',
      dnsServers: policy.dnsWhitelist.length > 0 ? policy.dnsWhitelist : undefined,
      extraHosts: {},
    };
  }

  private isValidTarget(target: string): boolean {
    return target.startsWith('http://') || target.startsWith('https://') || this.isIpOrCidr(target);
  }

  private extractHost(target: string): string {
    if (target.startsWith('http://') || target.startsWith('https://')) {
      try {
        const url = new URL(target);
        return url.hostname;
      } catch {
        return target;
      }
    }
    return target;
  }

  private extractDnsWhitelist(scopePolicy: ScopePolicy): string[] {
    // Use public DNS servers as fallback
    const defaultDns = ['8.8.8.8', '8.8.4.4', '1.1.1.1'];

    // Could extract from allowed assets if they specify DNS
    const customDns: string[] = [];
    for (const allowed of scopePolicy.allowedAssets) {
      if (this.isIpOrCidr(allowed)) {
        // If it looks like a DNS server (we could do more sophisticated detection)
        customDns.push(allowed);
      }
    }

    return customDns.length > 0 ? customDns : defaultDns;
  }

  private isIpOrCidr(value: string): boolean {
    // Simple IP/CIDR detection
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(\/\d{1,3})?$/;
    return ipv4Pattern.test(value) || ipv6Pattern.test(value);
  }
}

export const defaultNetworkPolicyBuilder = new DefaultNetworkPolicyBuilder();
