-- CreateTable
CREATE TABLE "Item" (
    "id" STRING NOT NULL,
    "title" STRING NOT NULL,
    "url" STRING,
    "lastUpdated" STRING,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Binding" (
    "id" INT8 NOT NULL DEFAULT unique_rowid(),
    "itemId" STRING NOT NULL,
    "channelId" STRING NOT NULL,
    "guildId" STRING,

    CONSTRAINT "Binding_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Binding" ADD CONSTRAINT "Binding_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
