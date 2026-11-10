/**
 * The public Cloudflare Stream embed, copied from the approved iframe.
 * Playback flags are left as Cloudflare supplies them: controls on, autoplay off, loop off, sound on.
 * The picture already contains captions, so no second text track is requested.
 * The host must stay the same value as telloyaStreamFrameOrigin in the security policy.
 */
export const telloyaStreamIframeSrc =
  "https://customer-k6b36ti9xjcfwdlg.cloudflarestream.com/b94516e33ac5c81c16e437f9cebe83c1/iframe?poster=https%3A%2F%2Fcustomer-k6b36ti9xjcfwdlg.cloudflarestream.com%2Fb94516e33ac5c81c16e437f9cebe83c1%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600"

export const telloyaStreamPlayer = {
  frameOrigin: "https://customer-k6b36ti9xjcfwdlg.cloudflarestream.com",
  iframeSrc: telloyaStreamIframeSrc,
  allow: "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;",
  title: "Telloya illustrative film",
  playLabel: "Play the Telloya illustrative film",
  description:
    "Illustrative film with captions in the picture. It is not a recording of a real customer.",
} as const
