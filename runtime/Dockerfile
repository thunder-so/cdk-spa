# Use the provided runtime version to fetch base image
# https://gallery.ecr.aws/docker/library/node
ARG NODE_VERSION
FROM public.ecr.aws/docker/library/node:${NODE_VERSION}-alpine

# Add repos 
RUN echo "http://dl-cdn.alpinelinux.org/alpine/edge/testing/" >> /etc/apk/repositories && \
    echo "http://dl-cdn.alpinelinux.org/alpine/edge/community/" >> /etc/apk/repositories && \
    apk update

# Install deps
RUN apk add --no-cache \
    bash \
    curl \
    git \
    zip \
    python3 \
    ca-certificates 

# Install Yarn (via corepack, included with Node)
RUN corepack enable && \
    corepack prepare yarn@stable --activate

ENV SHELL=/bin/bash

# Install pnpm
RUN curl -fsSL https://get.pnpm.io/install.sh | bash

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Verify everything works
RUN node --version && \
    npm --version && \
    corepack --version && \
    pnpm --version && \
    yarn --version

RUN rm -rf /var/cache/apk/*

# Default command
CMD ["bash", "-c"]