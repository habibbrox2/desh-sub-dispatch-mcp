FROM node:22-alpine
WORKDIR /app
COPY dist/server.bundle.cjs ./
COPY docs/index.html ./docs/index.html
ENV TRANSPORT=http PORT=8080
EXPOSE 8080
CMD ["node", "server.bundle.cjs", "--http"]