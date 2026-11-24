import { Composition } from "remotion";
import { Prueba } from "./plantillas/prueba/Prueba";

export const Root = () => (
  <>
    <Composition id="Prueba" component={Prueba} width={360} height={640} fps={30} durationInFrames={30} />
  </>
);
