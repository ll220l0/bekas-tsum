import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { ensureActiveRestaurant } from "@/lib/restaurant";
import { DEFAULT_RESTAURANT_SLUG } from "@/lib/restaurantConfig";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    const restaurant = await ensureActiveRestaurant();
    redirect(`/r/${restaurant.slug}`);
  } catch (error) {
    const isMissingTable =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
    if (!isMissingTable) {
      console.error("Home page DB lookup failed:", error);
    }
    redirect(`/r/${DEFAULT_RESTAURANT_SLUG}`);
  }
}
