import * as React from "react";
import * as RouterDom from "react-router-dom";

export * from "react-router-dom";

export const Link = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof RouterDom.Link>>(
  function Link(props, ref) {
    return <RouterDom.Link ref={ref} {...props} />;
  },
);

export const NavLink = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<typeof RouterDom.NavLink>
>(function NavLink(props, ref) {
  return <RouterDom.NavLink ref={ref} {...props} />;
});

export function Navigate(props: React.ComponentProps<typeof RouterDom.Navigate>) {
  return <RouterDom.Navigate {...props} />;
}

export function useNavigate() {
  return RouterDom.useNavigate();
}

