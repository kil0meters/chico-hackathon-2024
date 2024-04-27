import { and, eq, max, sql } from "drizzle-orm";
import { db } from "../db";
import { item, itemPrice, unit } from "../schema";
import type { PageServerLoad } from "./$types";
import Fuse from "fuse.js";

export type SearchParams = {
    query: string;
    category: string;
    sortBy: "PRICE" | "PRICE_PER_WEIGHT";
    sortType: "ASCENDING" | "DESCENDING";
};

export const load: PageServerLoad = async ({ url }) => {
    // let sortType = url.searchParams.get("sortType") ?? "ASCENDING";
    // let sortBy = url.searchParams.get("sortBy") ?? "PRICE_PER_WEIGHT";
    let category = url.searchParams.get("category") ?? "";
    let query = url.searchParams.get("q") ?? "";

    let itemId = url.searchParams.get("item") ?? "";

    let itemVal;

    if (itemId) {
        // itemVal = await db.query.item.findFirst({ with: { storeId: itemId } });

        itemVal = (
            await db
                .select({
                    id: item.storeId,
                    title: item.title,
                    date: max(itemPrice.date),
                    price: itemPrice.price,
                    image: item.imageUrl,
                    availability: itemPrice.availability,
                    pricePerUnit: itemPrice.pricePerUnit,
                    category: item.category,
                    unitDisplay: unit.unitDisplay,
                })
                .from(item)
                .leftJoin(itemPrice, eq(item.id, itemPrice.itemId))
                .leftJoin(unit, eq(itemPrice.unitId, unit.id))
                .where(eq(item.storeId, itemId))
                .limit(1)
        )[0];
    }

    if (!query && !category) {
        return { categories: [], items: [], item: itemVal };
    }

    let newItems = await db
        .select({
            id: item.storeId,
            title: item.title,
            dates: sql`group_concat(${itemPrice.date})`,
            prices: sql`group_concat(${itemPrice.price})`,
            image: item.imageUrl,
            availability: sql`group_concat(${itemPrice.availability})`,
            pricePerUnit: sql`group_concat(${itemPrice.pricePerUnit})`,
            category: item.category,
            unitDisplay: sql`group_concat(${unit.unitDisplay})`,
        })
        .from(item)
        .leftJoin(itemPrice, eq(item.id, itemPrice.itemId))
        .leftJoin(unit, eq(itemPrice.unitId, unit.id))
        .where(
            and(
                sql`${item.title} LIKE '%' || ${query} || '%' COLLATE NOCASE`,
                category ? sql`${item.category} = ${category}` : sql`1 = 1`,
            ),
        )
        .groupBy(item.id)
        .orderBy(
            category
                ? sql`MIN(${itemPrice.pricePerUnit})`
                : sql`MIN(${itemPrice.salesRank})`,
        )
        .limit(category ? 1000 : 20);

    // item
    newItems = newItems.map((i) => ({
        id: i.id,
        title: i.title,
        dates: (i.dates as any)
            .split(",")
            .map((d: string) => new Date(+d * 1000)) as Date[],
        prices: (i.prices as any).split(",").map((p: string) => +p) as number[],
        image: i.image,
        availability: i.availability,
        pricePerUnit: i.pricePerUnit,
        category: i.category,
        unitDisplay: i.unitDisplay,
    }));

    // console.log(newItems);

    // for (let item of newItems) {
    //     console.log(item.prices, item.dates);
    // }

    let categories = (
        await db
            .select({ category: item.category })
            .from(item)
            .groupBy(item.category)
    )
        .map((i) => i.category!)
        .filter((i) => i);

    const fuse = new Fuse(categories);
    categories = fuse
        .search(query)
        .map((i) => i.item)
        .slice(0, 10);

    return {
        items: newItems,
        categories,
        itemVal,
    };
};
