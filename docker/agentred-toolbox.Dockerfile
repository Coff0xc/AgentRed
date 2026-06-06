FROM alpine:3.19

# Security: Run as non-root user
RUN adduser -D -u 1000 agentred

# Install common security tools
RUN apk add --no-cache \
    curl \
    wget \
    bind-tools \
    nmap \
    nmap-scripts \
    python3 \
    py3-pip \
    nodejs \
    npm \
    git \
    ca-certificates

# Install nuclei
RUN wget -q https://github.com/projectdiscovery/nuclei/releases/download/v3.2.0/nuclei_3.2.0_linux_amd64.zip && \
    unzip nuclei_3.2.0_linux_amd64.zip && \
    mv nuclei /usr/local/bin/ && \
    chmod +x /usr/local/bin/nuclei && \
    rm nuclei_3.2.0_linux_amd64.zip

# Install httpx
RUN wget -q https://github.com/projectdiscovery/httpx/releases/download/v1.6.0/httpx_1.6.0_linux_amd64.zip && \
    unzip httpx_1.6.0_linux_amd64.zip && \
    mv httpx /usr/local/bin/ && \
    chmod +x /usr/local/bin/httpx && \
    rm httpx_1.6.0_linux_amd64.zip

# Install ffuf
RUN wget -q https://github.com/ffuf/ffuf/releases/download/v2.1.0/ffuf_2.1.0_linux_amd64.tar.gz && \
    tar -xzf ffuf_2.1.0_linux_amd64.tar.gz && \
    mv ffuf /usr/local/bin/ && \
    chmod +x /usr/local/bin/ffuf && \
    rm ffuf_2.1.0_linux_amd64.tar.gz

# Install sqlmap
RUN git clone --depth 1 https://github.com/sqlmapproject/sqlmap.git /opt/sqlmap && \
    ln -s /opt/sqlmap/sqlmap.py /usr/local/bin/sqlmap && \
    chmod +x /usr/local/bin/sqlmap

# Security: Remove privileged tools
RUN rm -f /bin/su /bin/sudo /usr/bin/passwd /sbin/apk

# Security: Remove shell history and sensitive files
RUN rm -rf /root/.ash_history /root/.wget-hsts /root/.cache

# Security: Make critical directories read-only for agentred user
RUN chmod 755 /usr/local/bin/* && \
    chown -R root:root /usr/local/bin

# Set working directory
WORKDIR /workspace

# Switch to non-root user
USER agentred

# Default command
ENTRYPOINT ["/bin/sh"]
CMD ["-c", "echo 'AgentRed Toolbox Ready' && sleep infinity"]
