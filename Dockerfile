# ==========================================
# STAGE 1: Dependency Assembly & Asset Compilations
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Single npm ci with all deps, then prune dev after build
COPY package*.json ./
RUN npm ci

# Copy full repository footprints
COPY . .

# Build, then strip devDependencies and save prod node_modules
RUN npm run build
RUN npm prune --omit=dev && cp -r node_modules prod_node_modules

# ==========================================
# STAGE 2: Secure Production Container Setup
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=3000

# Copy prebuilt artifacts and node_modules dependencies
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/api ./api
COPY --from=builder /usr/src/app/prod_node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/metadata.json ./

# Hardened security permissions (avoiding root user inside kernel boundaries)
RUN chown -R node:node /usr/src/app
USER node

EXPOSE 3000

CMD ["npm", "run", "start"]
