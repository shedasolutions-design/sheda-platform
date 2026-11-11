import { redirect } from "next/navigation";

/** Collections is entered from the Invest tab. */
export default function CollectionsIndex() {
  redirect("/invest");
}
