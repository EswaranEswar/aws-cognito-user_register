FROM node:20-bullseye-slim
## Setting base where the applicaiton runs.
 
# Install build tools, python3, and procps (includes ps command), then clean up
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential python3 procps && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
## If working directory is not set, then everything will be in the root folder.
 
# Copy dependency files first for better caching
COPY package*.json pnpm-lock.yaml ./
## For better readability, destinatioon folder is mentioned,
## or else by default, it is the working directory.
 
# Install pnpm globally and dependencies
RUN npm install -g pnpm && pnpm install
## Installing pnpm, and the dependencies.
 
COPY . .
## First dot, local files in the machine.
## Second dot, destination folder, which is working directory.
 
EXPOSE 3006
## Exposing the port
 
CMD ["pnpm", "run", "start:dev"]
## Final command after the image creation, which starts a container
## docker run -p 3000:3000 aws-cognito-user_register_app
##docker stop <container_id>