import { Config } from "@remotion/cli/config";
import { crearSobrescritura } from "./src/webpack.ts";

// Studio y la CLI corren desde video/ (los scripts de npm fijan el directorio).
Config.setVideoImageFormat("jpeg");
Config.overrideWebpackConfig(crearSobrescritura(process.cwd()));
