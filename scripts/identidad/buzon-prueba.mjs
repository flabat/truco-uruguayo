import { createServer } from "node:net";

// Receptor SMTP descartable. Escribe cada mensaje en una línea para la prueba del navegador.
const servidor = createServer(socket => {
  socket.setEncoding("utf8");
  socket.write("220 buzon.test\r\n");
  let entrada = "";
  let cuerpo = null;
  let fin;
  socket.on("data", bloque => {
    entrada += bloque;
    while ((fin = entrada.indexOf("\r\n")) !== -1) {
      const linea = entrada.slice(0, fin);
      entrada = entrada.slice(fin + 2);
      if (cuerpo !== null) {
        if (linea === ".") {
          console.log(JSON.stringify(cuerpo));
          cuerpo = null;
          socket.write("250 recibido\r\n");
        } else {
          cuerpo += linea.replace(/^\.\./, ".") + "\r\n";
        }
      } else if (linea === "DATA") {
        cuerpo = "";
        socket.write("354 mensaje\r\n");
      } else if (linea === "QUIT") {
        socket.end("221 fin\r\n");
      } else {
        socket.write("250 buzon.test\r\n");
      }
    }
  });
});
servidor.listen(1025, "0.0.0.0", () => console.log("listo"));
