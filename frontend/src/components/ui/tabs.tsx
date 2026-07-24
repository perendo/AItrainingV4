"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsProps {
  children: React.ReactNode;
  defaultValue: string;
  className?: string;
}

const Tabs = ({ children, defaultValue, className }: TabsProps) => {
  const [activeTab, setActiveTab] = React.useState(defaultValue);

  return (
    <div className={cn("space-y-4", className)}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child, { 
          activeTab, 
          setActiveTab,
        } as any);
      })}
    </div>
  );
};

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

const TabsList = ({ children, className }: TabsListProps) => {
  return (
    <div className={cn("grid grid-cols-4 gap-2 p-2 bg-muted rounded-lg", className)}>
      {children}
    </div>
  );
};

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  activeTab?: string;
  setActiveTab?: (value: string) => void;
}

const TabsTrigger = ({ value, children, className, activeTab, setActiveTab }: TabsTriggerProps) => {
  const isActive = activeTab === value;
  return (
    <button
      type="button"
      onClick={() => setActiveTab?.(value)}
      className={cn(
        "px-3 py-2 text-sm font-medium rounded-md transition-colors",
        isActive
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        className
      )}
    >
      {children}
    </button>
  );
};

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  activeTab?: string;
}

const TabsContent = ({ value, children, className, activeTab }: TabsContentProps) => {
  if (activeTab !== value) return null;
  return <div className={cn("space-y-4", className)}>{children}</div>;
};

export { Tabs, TabsList, TabsTrigger, TabsContent };