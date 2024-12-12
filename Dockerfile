FROM node:22-slim

WORKDIR /usr/src/app

COPY . .

ENV PORT=7999

EXPOSE 7999

CMD ["npm", "run", "start"]
