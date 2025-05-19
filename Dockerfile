# Use an official Node.js runtime as a parent image
FROM node:20

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of your app's source code
COPY . .

# Expose the port your app runs on (change if needed)
EXPOSE 3000

# Start the app using the docker-start script (runs migrations at runtime)
CMD ["npm", "run", "docker-start"]
