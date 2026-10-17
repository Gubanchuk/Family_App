import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// A page opened by a tap starts at its top, not at the place the last page was scrolled to. Back
// (a pop) leaves the scroll to the browser, which returns to where the page was left.
export default function ScrollTop() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  useEffect(() => { if (type !== 'POP') window.scrollTo(0, 0); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
