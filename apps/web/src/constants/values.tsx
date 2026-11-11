// Viewport size at load. Prefer CSS for layout; these exist for the few
// calculations carried over from the mobile app that need a number.
const deviceWidth = typeof window !== "undefined" ? window.innerWidth : 390;
const deviceHeight = typeof window !== "undefined" ? window.innerHeight : 844;

export { deviceHeight, deviceWidth };
