import { useId } from "react";
import type { GestoPie } from "../../motor/senas-pie";

// Las coordenadas siempre miran al emisor de frente. Su lado derecho queda a nuestra izquierda.
export function CaraSena({ gesto }: { gesto: GestoPie }) {
  const degradado = useId();
  const besito = gesto === "beso" || gesto.startsWith("labios-");
  const lengua = gesto === "lengua";
  const mordida = gesto === "labio-inferior";
  const abrir = gesto === "boca" || lengua || mordida;
  return <svg className="j-cara-sena" data-gesto={gesto}
    viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <defs><radialGradient id={degradado} cx=".36" cy=".28" r=".79">
      <stop stopColor="#ffe884"/><stop offset=".7" stopColor="#ffcc35"/><stop offset="1" stopColor="#f2a81c"/>
    </radialGradient></defs>
    <circle cx="32" cy="32" r="29" fill={`url(#${degradado})`} stroke="#693c11" strokeWidth="2.5"/>
    <g fill="none" stroke="#49301e" strokeWidth="2.9" strokeLinecap="round">
      <g className="j-cara-cejas"><path d="M13 22Q18 18 24 21 M40 21Q46 18 51 22"/></g>
      {[20,44].map((x,i)=>{
        const cerrado = gesto === "ojos-cerrados" || gesto === (i===0 ? "ojo-derecho" : "ojo-izquierdo");
        return <g key={x}>
          <g className={cerrado ? "j-cara-guino" : undefined} style={{transformOrigin:`${x}px 31px`}}>
            <ellipse cx={x} cy="30" rx="3.1" ry="4.4" fill="#432b19" stroke="none"/>
            <circle cx={x-.8} cy="28.6" r=".9" fill="#fff6dc" stroke="none"/>
          </g>
          {cerrado && <path className="j-cara-pliegue" d={`M${x-4} 31q4 3 8 0`} strokeWidth="2.4"/>}
        </g>;
      })}
      <g className="j-cara-nariz"><path d="M29 36q3-4 6 0" stroke="#945818" strokeWidth="2"/>
        {gesto==="nariz" && <path className="j-cara-pliegue" d="m24 33 3 1m10 0 3-1m-10-2 4-1" strokeWidth="1.4"/>}
      </g>
      {besito && <path className="j-cara-neutra" d="M25 45q7 1 14 0"/>}
      <g className="j-cara-boca">
        {besito ? <path className="j-cara-pliegue" d="M29 43q5-4 5 0l-3 2 3 2q0 3-5 1" strokeWidth="2.5"/> :
          abrir ? <g className="j-cara-apertura">
            <ellipse cx="32" cy="45" rx={mordida?7:5.5} ry={mordida?3.7:5.8} fill="#623025" strokeWidth="1.6"/>
            {lengua && <path className="j-cara-lengua" d="M28 46h8v3q0 6-4 6t-4-6z" fill="#ef8a85" strokeWidth="1.2"/>}
            {mordida && <><path d="M26 44q6 0 8 2l2 2q-7 2-10-1z" fill="#e88d80" strokeWidth=".8"/>
              <path d="M30 42h4l-1 3-2 .4z" fill="#fff7e6" strokeWidth=".7"/></>}
          </g> : <path d="M25 45q7 1 14 0"/>}
      </g>
    </g>
  </svg>;
}
