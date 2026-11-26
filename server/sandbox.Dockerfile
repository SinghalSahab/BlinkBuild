FROM mcr.microsoft.com/playwright:v1.64.1-noble

RUN mkdir -p /workspace && chown -R pwuser:pwuser /workspace

WORKDIR /workspace
USER pwuser
