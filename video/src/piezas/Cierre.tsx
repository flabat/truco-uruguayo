/** El llamado final, dentro de la franja de paño. */
export const Cierre = ({ texto = "Practicá contar tantos con manos nuevas, gratis y en el navegador." }: { texto?: string }) => (
  <div style={{ marginTop: 18 }}>
    <div style={{ font: "400 17px/1.35 var(--sans)" }}>{texto}</div>
    <div style={{ font: "700 30px/1.1 var(--sans)", color: "var(--oro)", marginTop: 18 }}>eltru.co/aprender/</div>
    <div style={{ font: "400 9px var(--sans)", opacity: .7, marginTop: 70 }}>Voz sintética en español de Uruguay</div>
  </div>
);
