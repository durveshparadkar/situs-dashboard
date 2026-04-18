"use client";

import { useState, useEffect } from "react";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";

export default function CommandMenu() {

  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((open) => !open);
      }

    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);

  }, []);

  return (

    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Global Command Menu"
      className="fixed inset-0 z-50 flex items-start justify-center pt-40 bg-black/40 backdrop-blur-sm"
    >

      {/* Accessibility title (hidden visually but required) */}
      <Dialog.Title className="sr-only">
        Command Menu
      </Dialog.Title>

      <div className="w-[600px]">

        {/* Input */}
        <Command.Input
          placeholder="Search deals, leads, actions..."
          className="
            w-full
            p-4
            text-sm
            outline-none
            border border-slate-200
            rounded-lg
            bg-white
          "
        />

        {/* Results */}
        <Command.List
          className="
            w-full
            bg-white
            border border-slate-200
            rounded-lg
            mt-2
            shadow-sm
          "
        >

          <Command.Item className="p-3 text-sm hover:bg-slate-50 cursor-pointer">
            Go to Dashboard
          </Command.Item>

          <Command.Item className="p-3 text-sm hover:bg-slate-50 cursor-pointer">
            View Pipeline
          </Command.Item>

          <Command.Item className="p-3 text-sm hover:bg-slate-50 cursor-pointer">
            Create New Lead
          </Command.Item>

        </Command.List>

      </div>

    </Command.Dialog>

  );
}