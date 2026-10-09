/**
 * Posts an avatar and reports progress.
 *
 * XMLHttpRequest rather than fetch, because only it exposes `upload.onprogress`, which is what
 * the percentage is made of. It carries a deadline on purpose: XHR's own default is no timeout at
 * all, so a request the server never answers leaves the promise unsettled and the page stuck
 * showing "Saving 90%" with no way out. Whatever goes wrong upstream, this settles.
 */

/** Long enough for a slow connection to send a few hundred KB, short enough to not look frozen. */
export const UPLOAD_TIMEOUT_MS = 45_000;

export interface AvatarUploadHandle {
  /** Resolves with the new avatar URL. */
  done: Promise<string>;
  /** Stops the request; `done` then rejects as cancelled. */
  cancel: () => void;
}

export function postAvatar(
  body: FormData,
  onProgress: (fraction: number) => void,
): AvatarUploadHandle {
  const xhr = new XMLHttpRequest();
  const done = new Promise<string>((resolve, reject) => {
    xhr.open("POST", "/api/avatars");
    xhr.responseType = "json";
    xhr.timeout = UPLOAD_TIMEOUT_MS;

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress(event.loaded / event.total);
    });
    xhr.addEventListener("load", () => {
      const payload: unknown = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300) {
        const url = (payload as { url?: unknown } | null)?.url;
        if (typeof url === "string") resolve(url);
        else reject(new Error("The upload returned no image."));
        return;
      }
      const message = (payload as { error?: { message?: unknown } } | null)?.error?.message;
      reject(new Error(typeof message === "string" ? message : "Couldn't upload that image."));
    });
    xhr.addEventListener("error", () => {
      reject(new Error("The upload failed. Check your connection and try again."));
    });
    xhr.addEventListener("timeout", () => {
      reject(new Error("The upload took too long and was stopped. Try again."));
    });
    xhr.addEventListener("abort", () => {
      reject(new Error("Upload cancelled."));
    });

    xhr.send(body);
  });

  return {
    done,
    cancel: () => {
      xhr.abort();
    },
  };
}
