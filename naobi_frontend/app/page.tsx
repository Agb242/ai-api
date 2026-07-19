import { redirect } from 'next/navigation';

/** Locale routing is handled by next-intl middleware; this root satisfies the App Router. */
export default function RootPage() {
  redirect('/fr');
}
