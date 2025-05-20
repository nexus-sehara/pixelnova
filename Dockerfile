FROM node:20

WORKDIR /app

# Copy lock file and package.json first for efficient caching
# This step only runs npm ci if package.json/lockfile changes
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --omit=dev # Use --omit=dev for production to only install prod dependencies

# Copy the rest of the application code
# This invalidates the cache for subsequent layers if source code changes
COPY . .

# Run the Remix build process - THIS IS CRUCIAL!
# This generates the 'build' directory
RUN npm run build

# Expose the port the Remix server runs on
EXPOSE 3000

# Command to run the application
# Your docker-start script runs setup (migrations) then start (server)
# This is a reasonable flow for production: migrate before starting app
CMD ["npm", "run", "docker-start"]