# Gebruik een lichte Node.js versie als basis
FROM node:18-alpine

# Stel de werkdirectory in
WORKDIR /app

# Kopieer package.json en package-lock.json naar de container
COPY package*.json ./

# Installeer de afhankelijkheden
RUN npm install

RUN mkdir -p /.npm && chmod -R 777 /.npm

# Kopieer de rest van de applicatiecode naar de container
COPY . .

# Expose de poort die door het script wordt gebruikt
EXPOSE 3000

# Start het script
CMD ["npm", "start"]
