-- Migration: Add business_type column to merchants table
ALTER TABLE public.merchants 
  ADD COLUMN IF NOT EXISTS business_type TEXT NULL;
