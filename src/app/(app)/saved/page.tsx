// /saved folds into the tracker's ★ filter (spec §4.1).
import { redirect } from "next/navigation";

export default function SavedRedirect() {
  redirect("/tracker?filter=starred");
}
