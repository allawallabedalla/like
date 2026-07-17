# Dockerfile — like als gehosteter Web-/PWA-Server. Der Server ist zero-dependency
# (nur Node-Builtins), also braucht das Image kein `npm install` — nur Node + die Dateien.
FROM node:20-alpine
WORKDIR /app
COPY . .
# Nutzdaten (gebaute Karten, Cache) liegen unter /data — als Volume mounten, sonst
# gehen sie beim Neustart/Redeploy verloren.
ENV LIKE_DATA_DIR=/data
ENV PORT=8080
# Öffentlich lauschen, damit der Plattform-Proxy den Container erreicht (lokal bleibt Default 127.0.0.1).
ENV HOST=0.0.0.0
VOLUME ["/data"]
EXPOSE 8080
# U-2c.6: Container-Health an den echten App-Endpoint koppeln (nutzt Nodes globales fetch).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/packs').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
