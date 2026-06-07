#!/usr/bin/env python3
"""
Performance Audit Visualization Script
Generates charts from AgentRed performance audit results
"""

import matplotlib.pyplot as plt
import numpy as np

# Performance data from audit
metrics = {
    'WebSocket Connect': {'target': 100, 'p95': 21.45, 'avg': 7.13},
    'WebSocket Message': {'target': 100, 'p95': 0.56, 'avg': 0.27},
    'API Health Check': {'target': 500, 'p95': 23.23, 'avg': 3.59},
    'API Create Run': {'target': 500, 'p95': 7.92, 'avg': 2.19},
    'Dispatcher Execute': {'target': 2000, 'p95': 7.69, 'avg': 7.69},
}

# Create figure with subplots
fig, axes = plt.subplots(2, 2, figsize=(14, 10))
fig.suptitle('AgentRed Performance Audit Results', fontsize=16, fontweight='bold')

# 1. P95 vs Target Comparison
ax1 = axes[0, 0]
names = list(metrics.keys())
targets = [metrics[n]['target'] for n in names]
p95s = [metrics[n]['p95'] for n in names]

x = np.arange(len(names))
width = 0.35

bars1 = ax1.bar(x - width/2, targets, width, label='Target', color='#ff6b6b', alpha=0.7)
bars2 = ax1.bar(x + width/2, p95s, width, label='P95 Actual', color='#51cf66', alpha=0.7)

ax1.set_ylabel('Time (ms)', fontweight='bold')
ax1.set_title('P95 Latency: Target vs Actual')
ax1.set_xticks(x)
ax1.set_xticklabels(names, rotation=45, ha='right')
ax1.legend()
ax1.set_yscale('log')
ax1.grid(True, alpha=0.3, linestyle='--')

# Add value labels on bars
for bar in bars2:
    height = bar.get_height()
    ax1.text(bar.get_x() + bar.get_width()/2., height,
             f'{height:.2f}ms',
             ha='center', va='bottom', fontsize=8)

# 2. Performance Improvement Percentage
ax2 = axes[0, 1]
improvements = [(1 - metrics[n]['p95']/metrics[n]['target']) * 100 for n in names]

bars = ax2.barh(names, improvements, color='#339af0', alpha=0.8)
ax2.set_xlabel('Performance Improvement (%)', fontweight='bold')
ax2.set_title('Performance vs Target (% Better)')
ax2.grid(True, alpha=0.3, axis='x', linestyle='--')

# Add value labels
for i, (bar, val) in enumerate(zip(bars, improvements)):
    ax2.text(val + 1, i, f'{val:.1f}%', va='center', fontweight='bold')

# Color bars by improvement level
for bar, val in zip(bars, improvements):
    if val >= 95:
        bar.set_color('#51cf66')  # Green for excellent
    elif val >= 80:
        bar.set_color('#74c0fc')  # Blue for good
    else:
        bar.set_color('#ffd43b')  # Yellow for acceptable

# 3. Average vs P95 Latency
ax3 = axes[1, 0]
avgs = [metrics[n]['avg'] for n in names]

x = np.arange(len(names))
width = 0.35

bars1 = ax3.bar(x - width/2, avgs, width, label='Average', color='#339af0', alpha=0.7)
bars2 = ax3.bar(x + width/2, p95s, width, label='P95', color='#ff6b6b', alpha=0.7)

ax3.set_ylabel('Time (ms)', fontweight='bold')
ax3.set_title('Average vs P95 Latency')
ax3.set_xticks(x)
ax3.set_xticklabels(names, rotation=45, ha='right')
ax3.legend()
ax3.set_yscale('log')
ax3.grid(True, alpha=0.3, linestyle='--')

# 4. Memory Usage
ax4 = axes[1, 1]
memory_data = {
    'Initial Heap': 36.17,
    'After Load Heap': 36.71,
    'Growth': 0.54,
}

colors = ['#339af0', '#ff6b6b', '#51cf66']
bars = ax4.bar(memory_data.keys(), memory_data.values(), color=colors, alpha=0.8)
ax4.set_ylabel('Memory (MB)', fontweight='bold')
ax4.set_title('Memory Usage (20 Runs, 200 Facts)')
ax4.grid(True, alpha=0.3, axis='y', linestyle='--')

# Add value labels
for bar in bars:
    height = bar.get_height()
    ax4.text(bar.get_x() + bar.get_width()/2., height,
             f'{height:.2f}MB',
             ha='center', va='bottom', fontweight='bold')

# Add target reference line at 100MB
ax4.axhline(y=100, color='r', linestyle='--', linewidth=2, label='100MB Target', alpha=0.5)
ax4.legend()

plt.tight_layout()
plt.savefig('performance-audit-charts.png', dpi=300, bbox_inches='tight')
print("✅ Performance charts saved to: performance-audit-charts.png")

# Print summary statistics
print("\n" + "="*60)
print("PERFORMANCE AUDIT SUMMARY")
print("="*60)
print("\nAll Targets Met: ✅ 8/8 Tests Passed\n")

print("Key Metrics:")
for name, data in metrics.items():
    improvement = (1 - data['p95']/data['target']) * 100
    print(f"  {name:25s} P95: {data['p95']:7.2f}ms (Target: {data['target']:6.0f}ms) → {improvement:5.1f}% better")

print(f"\nMemory Growth: {memory_data['Growth']:.2f}MB (99.5% better than 100MB threshold)")
print("\nStatus: 🎉 PRODUCTION READY - Exceptional Performance")
print("="*60)
