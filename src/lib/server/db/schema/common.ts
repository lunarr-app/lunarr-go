import type { ColumnType } from "kysely";

export type TimestampMs = ColumnType<number, number, number>;
export type TimestampText = ColumnType<string, string, string>;
export type JsonText = ColumnType<string | null, string | null | undefined, string | null | undefined>;
export type NullableText = ColumnType<string | null, string | null | undefined, string | null | undefined>;
export type NullableNumber = ColumnType<number | null, number | null | undefined, number | null | undefined>;
