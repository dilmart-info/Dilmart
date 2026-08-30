-- Add agent_id to orders table to support assigning delivery agents (mandubs)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.profiles(id);

-- Add index for better performance when filtering by agent
CREATE INDEX IF NOT EXISTS idx_orders_agent_id ON public.orders(agent_id);

-- Update RLS for agents to see their assigned orders
CREATE POLICY "Agents can view their assigned orders" 
ON public.orders 
FOR SELECT 
TO authenticated 
USING (auth.uid() = agent_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
