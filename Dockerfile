FROM node:20-alpine
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app
COPY package*.json ./
RUN npm install
COPY . /home/node/app/
RUN npm run build
RUN npx prisma generate
COPY --chown=node:node . .
USER node
CMD [ "npm", "start" ]