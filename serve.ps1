
$port = 8888
$root = Resolve-Path "."
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "Servidor rodando em http://localhost:$port/"
Write-Host "Pressione Ctrl+C para parar."

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath
        Write-Host "Requisitado: $path"
        
        if ($path -eq "/") { $path = "/index.html" }
        
        $filePath = Join-Path $root $path
        
        if (Test-Path $filePath -PathType Leaf) {
            $content = [System.IO.File]::ReadAllBytes($filePath)
            
            # MIME Types simples
            if ($path.EndsWith(".html")) { $response.ContentType = "text/html" }
            elseif ($path.EndsWith(".js")) { $response.ContentType = "application/javascript" }
            elseif ($path.EndsWith(".tsx")) { $response.ContentType = "text/plain" } # Precisará de transpilação no browser
            elseif ($path.EndsWith(".ts")) { $response.ContentType = "text/plain" }
            elseif ($path.EndsWith(".css")) { $response.ContentType = "text/css" }
            
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
        }
        else {
            $response.StatusCode = 404
        }
        $response.Close()
    }
    catch {
        Write-Host "Erro: $_"
    }
}
