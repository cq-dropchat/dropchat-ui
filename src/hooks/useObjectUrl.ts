import { useEffect, useState } from "react";

/**
 * F21: one object URL per blob, revoked when the blob changes or the
 * component unmounts. `URL.createObjectURL` in render made a new URL on every
 * render, and an unrevoked URL keeps its blob alive until the page unloads.
 */
export function useObjectUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return url;
}
