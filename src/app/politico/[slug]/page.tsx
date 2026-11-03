import type { Metadata } from "next";
import Home from "@/app/page";
import { getCachedProfile } from "@/lib/db";
import { findPortrait } from "@/lib/research";

function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return new URL(configuredUrl);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const profiles = await Promise.all([
    getCachedProfile(`${slug}:en:v4`),
    getCachedProfile(`${slug}:es:v4`),
    getCachedProfile(`${slug}:en:v3`),
    getCachedProfile(`${slug}:es:v3`),
  ]);
  const profile = profiles.find((candidate) => candidate);
  const siteUrl = getSiteUrl();
  const profileUrl = new URL(`/politico/${encodeURIComponent(slug)}`, siteUrl).toString();
  const title = profile ? `${profile.name} | Prontuario Politico` : `${slug} | Prontuario Politico`;
  const description = profile?.position || "Consulta el registro público y la trayectoria de un funcionario.";
  const imageUrl = profile?.imageUrl ?? (profile ? await findPortrait(profile.name, "es") : undefined);

  return {
    metadataBase: siteUrl,
    title,
    description,
    alternates: { canonical: profileUrl },
    openGraph: {
      type: "profile",
      url: profileUrl,
      title,
      description,
      siteName: "Prontuario Politico",
      ...(imageUrl ? { images: [{ url: imageUrl, alt: profile?.name ?? title }] } : {}),
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}

export default async function PoliticianPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Home initialSlug={slug} />;
}