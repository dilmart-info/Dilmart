-- Allow agents to update the status of orders assigned to them
CREATE POLICY "Agents can update their assigned orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (auth.uid() = agent_id)
WITH CHECK (auth.uid() = agent_id);
