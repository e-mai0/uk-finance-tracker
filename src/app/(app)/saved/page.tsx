// /saved folds into the tracker's ★ filter (spec §4.1). The filter itself
// ships in Plan 2 (Phase D); until then this lands on the full board.
import { redirect } from "next/navigation";

export default function SavedRedirect() {
  redirect("/tracker?filter=starred");
}
