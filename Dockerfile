# Dockerfile — like als gehosteter Web-/PWA-Server. Der Server ist zero-dependency
# (nur Node-Builtins), also braucht das Image kein `npm install` — nur Node + die Dateien.
FROM node:20-alpine
WORKDIR /app
COPY . .
# Nutzdaten (gebaute Karten, Cache) liegen unter /data — als Volume mounten, sonst
# gehen sie beim Neustart/Redeploy verloren.
ENV LIKE_DATA_DIR=/data
ENV PORT=8080
# Gehostet von außen erreichbar binden (lokal/Desktop bleibt sicher auf 127.0.0.1).
ENV LIKE_HOST=0.0.0.0
VOLUME ["/data"]
EXPOSE 8080
CMD ["node", "server.mjs"]
