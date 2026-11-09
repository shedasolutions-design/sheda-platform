/// <reference types="nativewind/types" />

// NativeWind's Metro transformer turns the stylesheet import into native
// styles, but TypeScript still needs to be told the import is legitimate.
declare module "*.css";
