import { Img, staticFile } from "remotion";

/** Grabado decorativo en el 20 % inferior, donde la red social pone sus botones. */
export const PieGrabado = () => (
  <Img src={staticFile("marca/mesa-criolla.webp")} style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: 128,
    objectFit: "cover", objectPosition: "center 35%", opacity: .28, mixBlendMode: "multiply",
    maskImage: "linear-gradient(transparent, #000 55%)" }} />
);
