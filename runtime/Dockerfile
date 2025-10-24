FROM node:24-alpine

RUN apk add --no-cache bash curl
RUN apk add fnm --repository=http://dl-cdn.alpinelinux.org/alpine/edge/testing/

# Setup fnm environment and install Node.js versions
RUN echo 'eval "$(fnm env --shell=bash --use-on-cd)"' >> /etc/profile && \
    bash -c "source /etc/profile && fnm install 20 && fnm install 22 && fnm install 24 && fnm default 24"

# Set environment
ENV ENV=/etc/profile
ENV SHELL=/bin/bash

# Install pnpm
RUN touch /etc/profile && curl -fsSL https://get.pnpm.io/install.sh | bash

# Install Yarn (via corepack, included with Node)
RUN corepack enable && \
    corepack prepare yarn@stable --activate

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Update PATH for pnpm and bun
ENV PATH="/root/.local/share/pnpm:/root/.bun/bin:$PATH"
RUN echo 'export PATH="/root/.bun/bin:$PATH"' >> /etc/profile

# Verify installations
RUN node -v && \
    npm -v && \
    pnpm -v && \
    yarn -v && \
    bun -v

# Set default command
CMD ["/bin/bash"]