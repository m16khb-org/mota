import { useGatewaySession } from "../hooks/useGatewaySession";

export function GoogleLogin() {
  const { authenticated, checked } = useGatewaySession();

  if (!checked || authenticated) return null;

  const gatewayUrl =
    import.meta.env.VITE_AUTH_GATEWAY_URL || "https://auth.m16khb.xyz";
  const loginUrl = new URL("/auth/google", gatewayUrl);
  loginUrl.searchParams.set(
    "return_to",
    window.location.origin + window.location.pathname,
  );

  return (
    <a className="google-login" href={loginUrl.toString()}>
      Google 로그인
    </a>
  );
}
