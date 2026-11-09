import { NextResponse, type NextRequest } from "next/server";
import { accessFor } from "@/lib/access";
import { freebuff } from "@/lib/freebuff";

/**
 * Blocca ogni rotta che non sia pubblica prima che venga eseguita la pagina o
 * l'API: senza sessione valida le pagine rimandano all'accesso e le API
 * rispondono 401. Nascondere un link nel browser non sarebbe autorizzazione.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const auth = freebuff();

  // Sulle rotte pubbliche ci limitiamo a rinnovare la sessione se è scaduta.
  if (pathname.startsWith("/auth/freebuff/")) return auth.proxy(request);

  const { user, cookies } = await auth.auth.authenticate(request);
  const decision = accessFor(pathname, search, Boolean(user));

  let response: NextResponse;
  if (decision.kind === "allow") {
    const headers = new Headers(request.headers);
    if (user) headers.set("x-portwatch-user", user.sub);
    response = NextResponse.next({ request: { headers } });
  } else if (decision.kind === "unauthorized") {
    response = NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  } else {
    const target = new URL("/auth/freebuff/signin", request.nextUrl.origin);
    target.searchParams.set("returnTo", decision.returnTo);
    response = NextResponse.redirect(target);
  }

  // I cookie di rinnovo/chiusura sessione devono tornare al browser, altrimenti
  // il refresh successivo viene interpretato come furto di token.
  for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
