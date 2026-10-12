declare module "@jscad/stl-serializer" {
  export interface StlSerializeOptions {
    binary?: boolean;
  }

  export function serialize(
    options: StlSerializeOptions,
    ...objects: unknown[]
  ): ArrayBuffer[] | string[];
}
