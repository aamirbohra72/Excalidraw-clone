-- CreateTable
CREATE TABLE "CanvasState" (
    "id" SERIAL NOT NULL,
    "roomIdentifier" TEXT NOT NULL,
    "canvasName" TEXT NOT NULL,
    "elements" JSONB NOT NULL,
    "pan" JSONB NOT NULL,
    "backgroundColor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CanvasState_roomIdentifier_key" ON "CanvasState"("roomIdentifier");
