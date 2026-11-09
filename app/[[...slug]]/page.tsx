"use client";

import dynamic from "next/dynamic";

const PreserveApp = dynamic(() => import("../../src/client/App").then((module) => module.PreserveApp), {
  ssr: false,
  loading: () => <p className="boot">Opening the installation…</p>,
});

export default function Page() {
  return <PreserveApp />;
}
