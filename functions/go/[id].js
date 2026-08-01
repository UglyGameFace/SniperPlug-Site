export async function onRequestGet(context) {
  const destination = new URL('/deals/', context.request.url);
  destination.searchParams.set('notice', 'retired-link');
  return Response.redirect(destination.toString(), 308);
}
