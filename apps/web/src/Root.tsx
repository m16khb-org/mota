import { useEffect } from "react";
import { App } from "./App";

export function Root() {
  useEffect(() => {
    if (/^\/3d-preview\/?$/.test(window.location.pathname)) {
      window.history.replaceState(window.history.state, "", "/");
    }
  }, []);
  return <App />;
}
