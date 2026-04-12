export async function waitForRenderableSurface(root?: ParentNode | null) {
  if (typeof document === "undefined") {
    return;
  }

  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font readiness failures and continue with best effort export.
    }
  }

  const imageNodes = Array.from((root ?? document).querySelectorAll?.("img") ?? []);
  await Promise.all(
    imageNodes.map(
      (imageNode) =>
        new Promise<void>((resolve) => {
          const image = imageNode as HTMLImageElement;
          if (image.complete) {
            resolve();
            return;
          }

          const finish = () => resolve();
          image.addEventListener("load", finish, { once: true });
          image.addEventListener("error", finish, { once: true });
        }),
    ),
  );

  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}
