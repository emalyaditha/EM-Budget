# ==========================================
# STAGE 1: Dependency Assembly & Asset Compilations
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Leverage Docker layer caching for node dependency footprints
COPY package*.json ./
RUN npm ci --only=production && cp -r node_modules prod_node_modules
RUN npm ci

# Copy full repository footprints
COPY . .

# Run production build and server compilation
RUN npm run build

# ==========================================
# STAGE 2: Secure Production Container Setup
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=3000

# Copy prebuilt artifacts and node_modules dependencies
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prod_node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/metadata.json ./

# Hardened security permissions (avoiding root user inside kernel boundaries)
RUN chown -R node:node /usr/src/app
USER node

EXPOSE 3000

CMD ["npm", "run", "start"]
