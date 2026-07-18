// The app scrolls inside the .kscroll container on desktop (body is
// overflow: hidden), but the body itself scrolls on mobile — so target both.
export function scrollAppToTop() {
  const scroller = document.querySelector(".kscroll");
  if (scroller) scroller.scrollTo({ top: 0, behavior: "smooth" });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
