"use client";

import { useParams } from "next/navigation";
import { ChildHomeworkEditor } from "@/components/homework/child-homework-editor";

/** Clicking an item in the list opens the Add page, filled in (ADR 0006). */
export default function EditHomeworkPage() {
  const { id } = useParams<{ id: string }>();
  return <ChildHomeworkEditor key={id} itemId={id} />;
}
